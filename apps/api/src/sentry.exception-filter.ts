import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter, HttpAdapterHost } from "@nestjs/core";

import { captureException } from "./sentry.js";

const shouldCapture = (exception: unknown): boolean => {
  if (exception instanceof HttpException) {
    return exception.getStatus() >= 500;
  }

  return true;
};

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (shouldCapture(exception)) {
      captureException(exception, { filter: "SentryExceptionFilter" });
    }

    super.catch(exception, host);
  }
}

