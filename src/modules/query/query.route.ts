import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { QueryController } from './query.controller';

const router = Router();
const controller = new QueryController();

router.use(authMiddleware);
router.use(requirePermission(PERMISSIONS.QUERY_EXECUTE));

router.post('/parse', controller.parse);
router.post('/execute', controller.execute);

export default router;
