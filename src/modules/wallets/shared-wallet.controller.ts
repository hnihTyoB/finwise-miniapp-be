import { Request, Response, NextFunction } from 'express';
import { SharedWalletService } from './shared-wallet.service';

export class SharedWalletController {
  private readonly service = new SharedWalletService();

  createInvitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createInvitation(
        req.user.id,
        req.params.id,
        req.body,
      );
      res.status(201).json({
        success: true,
        message: 'Tạo mã mời tham gia ví thành công',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getInvitations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getInvitations(req.user.id, req.params.id);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  cancelInvitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.cancelInvitation(
        req.user.id,
        req.params.id,
        req.params.inviteId,
      );
      res.json({
        success: true,
        message: 'Đã hủy mã mời tham gia ví',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  previewInvitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.previewInvitation(req.params.code);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  acceptInvitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.acceptInvitation(req.user.id, req.body);
      res.status(201).json({
        success: true,
        message: 'Bạn đã tham gia vào ví dùng chung thành công',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getMembers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getMembers(req.user.id, req.params.id);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  updateMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.updateMember(
        req.user.id,
        req.params.id,
        req.params.memberId,
        req.body,
      );
      res.json({
        success: true,
        message: 'Cập nhật thành viên thành công',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.removeMember(
        req.user.id,
        req.params.id,
        req.params.memberId,
      );
      res.json({
        success: true,
        message: 'Đã xóa thành viên khỏi ví dùng chung',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  leaveWallet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.leaveWallet(req.user.id, req.params.id);
      res.json({
        success: true,
        message: 'Bạn đã rời khỏi ví dùng chung thành công',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  getAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const result = await this.service.getAnalytics(
        req.user.id,
        req.params.id,
        from,
        to,
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
