import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Observable, throwError } from 'rxjs';

@Catch(Error)
export class MicroserviceRpcErrorCaptureLayer implements RpcExceptionFilter {
  catch(exception: Error): Observable<any> {
    const status = (exception as any).status || 500;
    const message = (exception as any).message || 'Internal server error';
    return throwError(() => new RpcException({ status, message }));
  }
}
