import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { aiRateLimitMiddleware } from '../../middlewares/ai-rate-limit.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { receiptUploadMiddleware } from '../transactions/transaction-upload.middleware';
import { AIAssistantController } from './ai-assistant.controller';
import {
  categorizeTransactionSchema,
  currencyExchangeRateSchema,
  extractReceiptSchema,
  financialChatSchema,
  financialInsightsSchema,
  financialRecommendationsSchema,
} from './ai-assistant.validation';

const router = Router();
const controller = new AIAssistantController();

router.use(authMiddleware);
router.use(aiRateLimitMiddleware);
router.use(requirePermission(PERMISSIONS.AI_ASSISTANT_USE));

router.post(
  '/categorize',
  validate(categorizeTransactionSchema),
  controller.categorizeTransaction,
);
router.post(
  '/receipts/extract',
  receiptUploadMiddleware,
  validate(extractReceiptSchema),
  controller.extractReceipt,
);
router.post('/chat', validate(financialChatSchema), controller.chat);
router.post(
  '/insights/analyze',
  validate(financialInsightsSchema),
  controller.analyzeInsights,
);
router.post(
  '/recommendations',
  validate(financialRecommendationsSchema),
  controller.recommend,
);
router.post(
  '/exchange-rate',
  validate(currencyExchangeRateSchema),
  controller.getExchangeRate,
);

export default router;
