import { NextFunction, Request, Response } from 'express';
import { CreatePresignedUploadDto } from './upload.dto';
import { UploadService } from './upload.service';

export class UploadController {
  private readonly service = new UploadService();

  createPresignedUpload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createPresignedUpload(
        req.user.id,
        req.body as CreatePresignedUploadDto,
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
