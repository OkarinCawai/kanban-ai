import { Module } from "@nestjs/common";

import { KanbanModule } from "../kanban/kanban.module.js";
import { HygieneController } from "./hygiene.controller.js";
import { HygieneService } from "./hygiene.service.js";

@Module({
  imports: [KanbanModule],
  controllers: [HygieneController],
  providers: [HygieneService]
})
export class HygieneModule {}

