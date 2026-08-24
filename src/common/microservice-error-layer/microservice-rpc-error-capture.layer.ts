import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch(Error)
export class MicroserviceRpcErrorCaptureLayer implements RpcExceptionFilter<Error> {
  catch(exception: Error): Observable<RpcException> {
    const status = 'status' in exception ? (exception.status as number) : 500;
    const message = exception.message || 'Internal server error';
    return throwError(() => new RpcException({ status, message }));
  }
}
