import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePermission } from '../../middlewares/permission.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { SimulationController } from './simulation.controller';
import { runSimulationSchema } from './simulation.validation';

const router = Router();
const controller = new SimulationController();

router.use(authMiddleware);

router.post('/run', requirePermission(PERMISSIONS.SIMULATION_EXECUTE), validate(runSimulationSchema), controller.run);
router.get('/presets', requirePermission(PERMISSIONS.SIMULATION_READ), controller.presets);

export default router;
