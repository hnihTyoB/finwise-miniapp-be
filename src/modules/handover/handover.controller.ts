import { Request, Response, NextFunction } from 'express';
import { HandoverService } from './handover.service';

export class HandoverController {
  constructor(private readonly service: HandoverService = new HandoverService()) {}

  initiate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.initiateHandover(req.user.id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(201).json({
        success: true,
        message: 'Tạo mã chuyển giao thành công',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getHandoverStatus(req.user.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  claim = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.claimHandover(req.user.id, req.body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Đã kết nối với tài khoản cũ. Vui lòng chờ xác thực mã OTP trên tài khoản cũ.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.confirmHandover(req.user.id, req.body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Chuyển giao quyền sở hữu dữ liệu thành công. Phiên làm việc của bạn đã kết thúc.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getResult = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getHandoverResult(
        req.user.id,
        req.params.handoverToken,
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.cancelHandover(req.user.id, req.body?.handoverToken, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(200).json({
        success: true,
        message: 'Đã hủy phiên chuyển giao thành công',
      });
    } catch (error) {
      next(error);
    }
  };
}
