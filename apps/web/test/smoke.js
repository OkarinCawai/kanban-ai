import http from "node:http";

const BASE_URL = "http://localhost:3002";

const fetchUrl = (path) =>
  new Promise((resolve, reject) => {
    http
      .get(`${BASE_URL}${path}`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          })
        );
      })
      .on("error", reject);
  });

const runSmokeTest = async () => {
  console.log(`Running smoke test against ${BASE_URL}...`);

  // Wait for server to start.
  await new Promise((resolve) => setTimeout(resolve, 2000));

  try {
    // 1. Check Root.
    const root = await fetchUrl("/");
    if (root.statusCode !== 200) {
      throw new Error(`Root returned ${root.statusCode}`);
    }
    if (
      !root.body.includes('<script type="module" src="./app.js">') &&
      !root.body.includes('<script type="module" src="app.js">')
    ) {
      // Allow both ./app.js and app.js.
      throw new Error("Root missing module script");
    }
    console.log("[OK] Root loaded");

    // 2. Check app.js (should handle imports).
    const appJs = await fetchUrl("/app.js");
    if (appJs.statusCode !== 200) {
      throw new Error(`app.js returned ${appJs.statusCode}`);
    }
    if (!appJs.body.includes("/src/api/client.js")) {
      throw new Error("app.js missing imports");
    }
    console.log("[OK] app.js loaded and transformed");

    // 3. Check TS asset mapping.
    const clientJs = await fetchUrl("/src/api/client.js");
    if (clientJs.statusCode !== 200) {
      throw new Error(`/src/api/client.js returned ${clientJs.statusCode}`);
    }
    if (!String(clientJs.headers["content-type"] ?? "").includes("javascript")) {
      throw new Error("client.js not served as javascript");
    }
    console.log("[OK] /src/api/client.js served correctly");

    console.log("Smoke test passed!");
    process.exit(0);
  } catch (error) {
    console.error(
      "Smoke test failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
};

void runSmokeTest();
