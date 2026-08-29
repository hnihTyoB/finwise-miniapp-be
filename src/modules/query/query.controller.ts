import { NextFunction, Request, Response } from 'express';
import { executeQuerySchema, parseQuerySchema } from './query.validation';
import { QueryService } from './query.service';

export class QueryController {
  private readonly service = new QueryService();

  parse = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query } = parseQuerySchema.parse(req.body);
      const data = await this.service.parseQuery(req.user.id, query);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  execute = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = executeQuerySchema.parse(req.body);
      const data = await this.service.executeQuery(
        req.user.id,
        input.query,
        input.ast,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
