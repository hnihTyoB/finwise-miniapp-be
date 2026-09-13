import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { QueryController } from './query.controller';
import { executeQuerySchema, parseQuerySchema } from './query.validation';

const router = Router();
const controller = new QueryController();

router.use(authMiddleware);
router.use(requirePermission(PERMISSIONS.QUERY_EXECUTE));

router.post('/parse', validate(parseQuerySchema), controller.parse);
router.post('/execute', validate(executeQuerySchema), controller.execute);

export default router;
