import { Module } from "@nestjs/common";

import { KanbanModule } from "./kanban/kanban.module.js";

@Module({
  imports: [KanbanModule]
})
export class AppModule {}
