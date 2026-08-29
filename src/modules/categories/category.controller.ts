import { NextFunction, Request, Response } from 'express';
import {
  CategoryQueryDto,
  CategoryTreeQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './category.dto';
import { CategoryService } from './category.service';

export class CategoryController {
  private readonly service = new CategoryService();

  findAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.findAll(
        req.user.id,
        req.query as unknown as CategoryQueryDto,
      );

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  findTree = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await this.service.findTree(
        req.user.id,
        req.query as unknown as CategoryTreeQueryDto,
      );

      res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  };

  findById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await this.service.findById(req.user.id, req.params.id);

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await this.service.create(
        req.user.id,
        req.body as CreateCategoryDto,
      );

      res.status(201).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await this.service.update(
        req.user.id,
        req.params.id,
        req.body as UpdateCategoryDto,
      );

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  };

  archive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await this.service.archive(req.user.id, req.params.id);

      res.json({
        success: true,
        message: 'Category archived successfully',
        data: category,
      });
    } catch (error) {
      next(error);
    }
  };

  restore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await this.service.restore(req.user.id, req.params.id);

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  };
}

