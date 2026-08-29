import { NextFunction, Request, Response } from 'express';
import { runSimulationSchema } from './simulation.validation';
import { SimulationService } from './simulation.service';

export class SimulationController {
  private readonly service = new SimulationService();

  run = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = runSimulationSchema.parse(req.body);
      const data = await this.service.runSimulation(req.user.id, input);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  presets = (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = this.service.getPresets();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
