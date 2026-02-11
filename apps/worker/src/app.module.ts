import { Module } from "@nestjs/common";

import { OutboxPollerService } from "./outbox-poller.service.js";

@Module({
  providers: [OutboxPollerService]
})
export class WorkerModule {}
