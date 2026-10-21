import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
@Injectable()
export class CatalogAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    if (!context.switchToHttp().getRequest().session?.user?.id)
      throw new UnauthorizedException();
    return true;
  }
}
