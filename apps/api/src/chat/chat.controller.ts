import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ChatSessionService } from './chat-session.service';
import { ChatOrchestratorService } from './chat-orchestrator.service';
import { AppendMessageDto } from './dto/append-message.dto';

@Controller('chat/sessions')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly sessions: ChatSessionService,
    private readonly orchestrator: ChatOrchestratorService,
  ) {}

  @Post()
  createSession() {
    return this.sessions.create();
  }

  @Get(':sessionId')
  getSession(@Param('sessionId', new ParseUUIDPipe()) sessionId: string) {
    return this.sessions.findById(sessionId);
  }

  @Post(':sessionId/messages')
  appendMessage(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: AppendMessageDto,
  ) {
    return this.orchestrator.processMessage(sessionId, body.content);
  }

  @Post(':sessionId/messages/stream')
  async streamMessage(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() body: AppendMessageDto,
    @Res() response: Response,
  ): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    try {
      const result = await this.orchestrator.processMessage(
        sessionId,
        body.content,
        (progress) => {
          writeSseEvent(response, 'progress', progress);
        },
      );
      writeSseEvent(response, 'completed', result);
    } catch (error) {
      this.logger.error(
        'Chat stream processing failed',
        error instanceof Error ? error.stack : String(error),
      );
      writeSseEvent(response, 'error', {
        message: advisorSafeErrorMessage(error),
      });
    } finally {
      response.end();
    }
  }
}

function writeSseEvent(response: Response, event: string, data: unknown): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

function advisorSafeErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status === 404
  ) {
    return 'La sesión no existe o expiró.';
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 503
  ) {
    return 'Insoft no está respondiendo y todavía no hay un inventario sincronizado disponible. Inténtalo nuevamente en unos momentos.';
  }
  return 'No pude completar la consulta en este momento. Inténtalo nuevamente.';
}
