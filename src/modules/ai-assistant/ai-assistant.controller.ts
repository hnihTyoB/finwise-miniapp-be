import { NextFunction, Request, Response } from 'express';
import {
  CategorizeTransactionDto,
  ExtractReceiptDto,
  FinancialChatDto,
  FinancialInsightsDto,
  FinancialRecommendationsDto,
} from './ai-assistant.dto';
import { AIAssistantService } from './ai-assistant.service';

export class AIAssistantController {
  private readonly service = new AIAssistantService();

  categorizeTransaction = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.service.categorizeTransaction(
        req.user.id,
        req.body as CategorizeTransactionDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  extractReceipt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.extractReceipt(
        req.user.id,
        req.file!,
        req.body as ExtractReceiptDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  chat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.chat(
        req.user.id,
        req.body as FinancialChatDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  analyzeInsights = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.analyzeInsights(
        req.user.id,
        req.body as FinancialInsightsDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  recommend = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.recommend(
        req.user.id,
        req.body as FinancialRecommendationsDto,
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
