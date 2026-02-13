param(
  [ValidateSet("start", "stop", "restart", "status")]
  [string]$Action = "restart",
  [switch]$SkipBuild,
  [switch]$SkipTunnel,
  [switch]$WebReact
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$statePath = Join-Path $root "dev_stack_state.json"
$dotenvPath = Join-Path $root ".env"
$discordPublicUrlEnvKey = "DISCORD_INTERACTIONS_PUBLIC_URL"
$requiredArtifacts = @(
  "apps/api/dist/src/main.js",
  "apps/web/dist/src/dev-server.js",
  "apps/discord/dist/src/main.js",
  "apps/worker/dist/src/main.js"
)

$serviceDefs = @(
  [pscustomobject]@{
    Name = "api"
    Entry = "apps/api/dist/src/main.js"
    UseDotenvConfig = $true
    Port = 3001
    Out = "dev_api_out.log"
    Err = "dev_api_err.log"
    ProbeUri = "http://localhost:3001/"
    ProbeMethod = "GET"
    ProbeBody = $null
  },
  [pscustomobject]@{
    Name = "web"
    Entry = "apps/web/dist/src/dev-server.js"
    UseDotenvConfig = $false
    Port = 3002
    Out = "dev_web_out.log"
    Err = "dev_web_err.log"
    ProbeUri = "http://localhost:3002/"
    ProbeMethod = "GET"
    ProbeBody = $null
  },
  [pscustomobject]@{
    Name = "discord"
    Entry = "apps/discord/dist/src/main.js"
    UseDotenvConfig = $true
    Port = 3003
    Out = "dev_discord_out.log"
    Err = "dev_discord_err.log"
    ProbeUri = "http://localhost:3003/interactions"
    ProbeMethod = "POST"
    ProbeBody = "{}"
  },
  [pscustomobject]@{
    Name = "worker"
    Entry = "apps/worker/dist/src/main.js"
    UseDotenvConfig = $true
    Port = 3004
    Out = "dev_worker_out.log"
    Err = "dev_worker_err.log"
    ProbeUri = "http://localhost:3004/healthz"
    ProbeMethod = "GET"
    ProbeBody = $null
  }
)

if ($WebReact) {
  $serviceDefs += [pscustomobject]@{
    Name = "web-react"
    Workspace = "@kanban/web-react"
    NpmScript = "dev"
    UseDotenvConfig = $false
    Port = 3005
    Out = "dev_web_react_out.log"
    Err = "dev_web_react_err.log"
    ProbeUri = "http://localhost:3005/"
    ProbeMethod = "GET"
    ProbeBody = $null
  }
}

$tunnelDef = [pscustomobject]@{
  Exe = (Join-Path $root "tools/cloudflared.exe")
  Out = "dev_tunnel_out.log"
  Err = "dev_tunnel_err.log"
  Origin = "http://localhost:3003"
}

function Write-Step {
  param([string]$Message)
  Write-Host "[dev-stack] $Message"
}

function Read-State {
  if (-not (Test-Path $statePath)) {
    return $null
  }

  try {
    return Get-Content $statePath -Raw | ConvertFrom-Json
  } catch {
    Write-Step "State file is unreadable; continuing without it."
    return $null
  }
}

function Save-State {
  param([object]$State)
  $State | ConvertTo-Json -Depth 6 | Set-Content -Path $statePath -Encoding UTF8
}

function Set-OrAppendEnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  if (-not (Test-Path $Path)) {
    Write-Step "No .env file found at $Path; skipping $Key sync."
    return $false
  }

  $lines = @(Get-Content -LiteralPath $Path)
  $pattern = "^\s*" + [regex]::Escape($Key) + "\s*="
  $replacement = "$Key=$Value"
  $updated = $false

  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match $pattern) {
      $lines[$index] = $replacement
      $updated = $true
      break
    }
  }

  if (-not $updated) {
    $lines += $replacement
  }

  Set-Content -LiteralPath $Path -Value $lines -Encoding ASCII
  return $true
}

function Sync-InteractionsPublicUrl {
  param([string]$PublicUrl)

  if ([string]::IsNullOrWhiteSpace($PublicUrl)) {
    return
  }

  $normalized = $PublicUrl.Trim().TrimEnd("/")
  $synced = Set-OrAppendEnvValue `
    -Path $dotenvPath `
    -Key $discordPublicUrlEnvKey `
    -Value $normalized

  if ($synced) {
    Write-Step "Synced $discordPublicUrlEnvKey in .env to $normalized"
  }

  Write-Step "Discord Interactions Endpoint URL: $normalized/interactions"
}

function Remove-FileIfExists {
  param([string]$Path)
  Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
}

function Get-ListeningPidsByPort {
  param([int]$Port)

  $pids = New-Object System.Collections.Generic.HashSet[int]
  $lines = netstat -ano -p tcp | Select-String ":$Port\s"

  foreach ($line in $lines) {
    $tokens = ($line.ToString() -replace "\s+", " ").Trim().Split(" ")
    if ($tokens.Length -lt 5) {
      continue
    }

    if ($tokens[3] -ne "LISTENING") {
      continue
    }

    $pidToken = $tokens[4]
    $parsedPid = 0
    if ([int]::TryParse($pidToken, [ref]$parsedPid)) {
      $null = $pids.Add($parsedPid)
    }
  }

  return @($pids)
}

function Get-PrimaryListeningPidByPort {
  param([int]$Port)

  $pids = @(Get-ListeningPidsByPort -Port $Port | Sort-Object)
  if ($pids.Count -eq 0) {
    return 0
  }

  return [int]$pids[0]
}

function Stop-PidIfRunning {
  param(
    [int]$ProcessId,
    [string]$Label
  )

  if ($ProcessId -le 0) {
    return
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }

  Write-Step "Stopping $Label (PID $ProcessId)."
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-TrackedProcesses {
  $state = Read-State
  if ($null -eq $state) {
    return
  }

  if ($state.services) {
    foreach ($service in $state.services) {
      $pidValue = 0
      [void][int]::TryParse([string]$service.Pid, [ref]$pidValue)
      Stop-PidIfRunning -ProcessId $pidValue -Label "$($service.Name) tracked process"
    }
  }

  if ($state.tunnel -and $state.tunnel.Pid) {
    $tunnelPid = 0
    [void][int]::TryParse([string]$state.tunnel.Pid, [ref]$tunnelPid)
    Stop-PidIfRunning -ProcessId $tunnelPid -Label "cloudflared"
  }

  Remove-FileIfExists $statePath
}

function Stop-ServicePorts {
  foreach ($serviceDef in $serviceDefs) {
    $pids = @(Get-ListeningPidsByPort -Port $serviceDef.Port)
    foreach ($procId in $pids) {
      Stop-PidIfRunning -ProcessId $procId -Label "$($serviceDef.Name) listener on :$($serviceDef.Port)"
    }
  }
}

function Stop-TunnelProcesses {
  $tunnelProcesses = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
  foreach ($process in $tunnelProcesses) {
    Stop-PidIfRunning -ProcessId $process.Id -Label "cloudflared"
  }
}

function Stop-Stack {
  Write-Step "Stopping running stack processes."
  Stop-TrackedProcesses
  Stop-ServicePorts
  Stop-TunnelProcesses
}

function Ensure-BuildArtifacts {
  $missing = @()
  foreach ($artifact in $requiredArtifacts) {
    $artifactPath = Join-Path $root $artifact
    if (-not (Test-Path $artifactPath)) {
      $missing += $artifact
    }
  }

  if ($missing.Count -eq 0) {
    Write-Step "Build artifacts present; skipping build."
    return
  }

  if ($SkipBuild) {
    $missingList = $missing -join ", "
    throw "Missing build artifacts: $missingList. Re-run without -SkipBuild."
  }

  Write-Step "Missing build artifacts detected. Running workspace build."
  Push-Location $root
  try {
    & npm.cmd run build --workspaces --if-present
    if ($LASTEXITCODE -ne 0) {
      throw "Workspace build failed with exit code $LASTEXITCODE."
    }
  } finally {
    Pop-Location
  }
}

function Get-StatusCodeFromException {
  param([System.Exception]$Exception)

  if ($null -eq $Exception) {
    return $null
  }

  $response = $Exception.Response
  if ($null -eq $response) {
    return $null
  }

  try {
    return [int]$response.StatusCode.value__
  } catch {
    try {
      return [int]$response.StatusCode
    } catch {
      return $null
    }
  }
}

function Invoke-Probe {
  param(
    [string]$Uri,
    [string]$Method,
    [string]$Body
  )

  if ($Method -eq "GET") {
    return Invoke-WebRequest -Uri $Uri -Method Get -TimeoutSec 4 -UseBasicParsing
  }

  return Invoke-WebRequest -Uri $Uri -Method $Method -Body $Body -ContentType "application/json" -TimeoutSec 4 -UseBasicParsing
}

function Wait-ForServiceProbe {
  param([pscustomobject]$ServiceDef)

  $deadline = (Get-Date).AddSeconds(45)
  do {
    $statusCode = $null
    try {
      $response = Invoke-Probe -Uri $ServiceDef.ProbeUri -Method $ServiceDef.ProbeMethod -Body $ServiceDef.ProbeBody
      $statusCode = [int]$response.StatusCode
    } catch {
      $statusCode = Get-StatusCodeFromException -Exception $_.Exception
    }

    $ready = $false
    if ($null -ne $statusCode) {
      if ($ServiceDef.Name -eq "web" -or $ServiceDef.Name -eq "web-react") {
        $ready = ($statusCode -eq 200)
      } elseif ($ServiceDef.Name -eq "discord") {
        $ready = ($statusCode -eq 401)
      } elseif ($ServiceDef.Name -eq "worker") {
        $ready = ($statusCode -eq 200)
      } else {
        $ready = ($statusCode -lt 500)
      }
    }

    if ($ready) {
      Write-Step "$($ServiceDef.Name) ready on :$($ServiceDef.Port) (HTTP $statusCode)."
      return
    }

    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)

  $outPath = Join-Path $root $ServiceDef.Out
  $errPath = Join-Path $root $ServiceDef.Err
  $outTail = if (Test-Path $outPath) { (Get-Content $outPath -Tail 50) -join "`n" } else { "(missing)" }
  $errTail = if (Test-Path $errPath) { (Get-Content $errPath -Tail 50) -join "`n" } else { "(missing)" }

  throw @"
Service '$($ServiceDef.Name)' failed readiness probe.
Probe: $($ServiceDef.ProbeMethod) $($ServiceDef.ProbeUri)
stdout tail:
$outTail
stderr tail:
$errTail
"@
}

function Start-ServiceProcess {
  param([pscustomobject]$ServiceDef)

  $outPath = Join-Path $root $ServiceDef.Out
  $errPath = Join-Path $root $ServiceDef.Err
  Remove-FileIfExists $outPath
  Remove-FileIfExists $errPath

  $isNodeEntrypoint = $ServiceDef.PSObject.Properties.Name -contains "Entry"
  $isNpmWorkspace = (-not $isNodeEntrypoint) -and `
    ($ServiceDef.PSObject.Properties.Name -contains "Workspace") -and `
    ($ServiceDef.PSObject.Properties.Name -contains "NpmScript")

  if (-not $isNodeEntrypoint -and -not $isNpmWorkspace) {
    throw "Service '$($ServiceDef.Name)' must define Entry or Workspace+NpmScript."
  }

  $escapedOut = $outPath -replace '"', '""'
  $escapedErr = $errPath -replace '"', '""'
  $commandSegments = @()
  if ($ServiceDef.UseDotenvConfig) {
    $escapedDotenv = $dotenvPath -replace '"', '""'
    $commandSegments += "set `"DOTENV_CONFIG_PATH=$escapedDotenv`""
  }

  $serviceState = $null
  if ($isNodeEntrypoint) {
    $entryPath = Join-Path $root $ServiceDef.Entry
    if (-not (Test-Path $entryPath)) {
      throw "Missing entrypoint for service '$($ServiceDef.Name)': $entryPath"
    }

    Write-Step "Starting $($ServiceDef.Name) (node $($ServiceDef.Entry))."
    $escapedEntry = $entryPath -replace '"', '""'
    $commandSegments += "node.exe `"$escapedEntry`" 1>>`"$escapedOut`" 2>>`"$escapedErr`""

    $serviceState = [pscustomobject]@{
      Name = $ServiceDef.Name
      Entry = $ServiceDef.Entry
      Port = $ServiceDef.Port
      Out = $ServiceDef.Out
      Err = $ServiceDef.Err
    }
  } else {
    $workspace = [string]$ServiceDef.Workspace
    $npmScript = [string]$ServiceDef.NpmScript

    if ([string]::IsNullOrWhiteSpace($workspace) -or [string]::IsNullOrWhiteSpace($npmScript)) {
      throw "Service '$($ServiceDef.Name)' Workspace/NpmScript cannot be empty."
    }

    Write-Step "Starting $($ServiceDef.Name) (npm run $npmScript --workspace $workspace)."
    $commandSegments += "npm.cmd run $npmScript --workspace $workspace 1>>`"$escapedOut`" 2>>`"$escapedErr`""

    $serviceState = [pscustomobject]@{
      Name = $ServiceDef.Name
      Workspace = $workspace
      Script = $npmScript
      Port = $ServiceDef.Port
      Out = $ServiceDef.Out
      Err = $ServiceDef.Err
    }
  }
  $commandScript = $commandSegments -join " && "

  $process = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/d", "/c", $commandScript) `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden

  Start-Sleep -Milliseconds 250
  if ($process.HasExited) {
    $errTail = if (Test-Path $errPath) { (Get-Content $errPath -Tail 30) -join "`n" } else { "(missing)" }
    throw "Failed to start $($ServiceDef.Name); process exited immediately. stderr tail:`n$errTail"
  }

  $serviceState | Add-Member -NotePropertyName Pid -NotePropertyValue $process.Id
  return $serviceState
}

function Wait-ForTunnelUrl {
  param([string]$ErrorLogPath)

  $deadline = (Get-Date).AddSeconds(25)
  $pattern = "https://[a-z0-9-]+\.trycloudflare\.com"

  do {
    if (Test-Path $ErrorLogPath) {
      $content = Get-Content $ErrorLogPath -Raw
      $match = [regex]::Match($content, $pattern)
      if ($match.Success) {
        return $match.Value
      }
    }

    Start-Sleep -Milliseconds 750
  } while ((Get-Date) -lt $deadline)

  return $null
}

function Start-TunnelProcess {
  if (-not (Test-Path $tunnelDef.Exe)) {
    Write-Step "cloudflared.exe not found at tools/cloudflared.exe; skipping tunnel startup."
    return $null
  }

  $outPath = Join-Path $root $tunnelDef.Out
  $errPath = Join-Path $root $tunnelDef.Err
  Remove-FileIfExists $outPath
  Remove-FileIfExists $errPath

  Write-Step "Starting Cloudflare tunnel for $($tunnelDef.Origin)."
  $process = Start-Process `
    -FilePath $tunnelDef.Exe `
    -ArgumentList @("tunnel", "--url", $tunnelDef.Origin, "--no-autoupdate", "--ha-connections", "1", "--logfile", $errPath) `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden

  Start-Sleep -Milliseconds 300
  if ($process.HasExited) {
    $errTail = if (Test-Path $errPath) { (Get-Content $errPath -Tail 30) -join "`n" } else { "(missing)" }
    throw "cloudflared exited immediately. stderr tail:`n$errTail"
  }

  $publicUrl = Wait-ForTunnelUrl -ErrorLogPath $errPath
  if ($publicUrl) {
    Write-Step "Cloudflare quick tunnel URL: $publicUrl"
  } else {
    Write-Step "Cloudflare started, but tunnel URL was not detected yet. Check $($tunnelDef.Err)."
  }

  return [pscustomobject]@{
    Pid = $process.Id
    Out = $tunnelDef.Out
    Err = $tunnelDef.Err
    PublicUrl = $publicUrl
  }
}

function Get-ProcessStatus {
  param([int]$ProcessId)
  if ($ProcessId -le 0) {
    return "n/a"
  }

  if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
    return "running"
  }

  return "stopped"
}

function Show-Status {
  $state = Read-State
  Write-Step "Status snapshot"

  $rows = @()
  foreach ($serviceDef in $serviceDefs) {
    $listeners = @(Get-ListeningPidsByPort -Port $serviceDef.Port)
    $pidText = if ($listeners.Count -gt 0) { ($listeners -join ",") } else { "-" }
    $rows += [pscustomobject]@{
      Service = $serviceDef.Name
      Port = $serviceDef.Port
      ListeningPid = $pidText
    }
  }

  $rows | Format-Table -AutoSize

  if ($state -and $state.services) {
    Write-Step "Tracked processes"
    $trackedRows = @()
    foreach ($service in $state.services) {
      $pidValue = 0
      [void][int]::TryParse([string]$service.Pid, [ref]$pidValue)
      $entryValue = "-"
      if ($service.PSObject.Properties.Name -contains "Entry") {
        $entryValue = [string]$service.Entry
      } elseif ($service.PSObject.Properties.Name -contains "Workspace") {
        $entryValue = [string]$service.Workspace
      }

      $trackedRows += [pscustomobject]@{
        Service = $service.Name
        Entry = $entryValue
        Pid = $pidValue
        Status = Get-ProcessStatus -ProcessId $pidValue
        Out = $service.Out
        Err = $service.Err
      }
    }
    $trackedRows | Format-Table -AutoSize
  } else {
    Write-Step "No tracked service state file found."
  }

  if ($state -and $state.tunnel) {
    $tunnelPid = 0
    [void][int]::TryParse([string]$state.tunnel.Pid, [ref]$tunnelPid)
    $tunnelStatus = Get-ProcessStatus -ProcessId $tunnelPid
    Write-Step "Tunnel PID: $tunnelPid ($tunnelStatus)"
    if ($state.tunnel.PublicUrl) {
      Write-Step "Tunnel URL: $($state.tunnel.PublicUrl)"
    }
  }
}

function Start-Stack {
  Stop-Stack
  Ensure-BuildArtifacts

  $startedServices = @()
  try {
    foreach ($serviceDef in $serviceDefs) {
      $startedServices += Start-ServiceProcess -ServiceDef $serviceDef
    }

    for ($index = 0; $index -lt $serviceDefs.Count; $index++) {
      $serviceDef = $serviceDefs[$index]
      Wait-ForServiceProbe -ServiceDef $serviceDef
      $listenerPid = Get-PrimaryListeningPidByPort -Port $serviceDef.Port
      if ($listenerPid -gt 0) {
        $startedServices[$index].Pid = $listenerPid
      }
    }

    $tunnelState = $null
    if (-not $SkipTunnel) {
      $tunnelState = Start-TunnelProcess
      if ($tunnelState -and $tunnelState.PublicUrl) {
        Sync-InteractionsPublicUrl -PublicUrl $tunnelState.PublicUrl
      }
    } else {
      Write-Step "Skipping Cloudflare tunnel startup (-SkipTunnel)."
    }

    $state = [pscustomobject]@{
      Root = $root
      StartedAt = (Get-Date).ToString("o")
      Services = $startedServices
      Tunnel = $tunnelState
    }

    Save-State -State $state
    Show-Status
  } catch {
    Write-Step "Start failed; cleaning up."
    Stop-Stack
    throw
  }
}

switch ($Action) {
  "start" {
    Start-Stack
  }
  "stop" {
    Stop-Stack
    Show-Status
  }
  "restart" {
    Start-Stack
  }
  "status" {
    Show-Status
  }
  default {
    throw "Unsupported action: $Action"
  }
}
