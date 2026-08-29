import { AppError } from '../../common/errors/app-error';
import { ERROR_CODE } from '../../common/errors/error-code';
import { systemSettingService } from '../system-settings/system-setting.service';
import {
  ExecuteQueryResultDto,
  ParseQueryResponseDto,
  QueryAST,
} from './query.dto';
import { QueryCompiler } from './query-compiler';
import { QueryParser } from './query-parser';
import { QueryRepository } from './query.repository';

export class QueryService {
  private readonly repository = new QueryRepository();

  private async ensureQueryEnabled() {
    const enabled = await systemSettingService.getBoolean('ai.query.enabled', true);
    if (!enabled) {
      throw new AppError(
        'Tính năng Truy vấn ngôn ngữ tự nhiên đang tạm thời bị vô hiệu hóa bởi quản trị viên',
        403,
        ERROR_CODE.FORBIDDEN,
      );
    }
  }

  async parseQuery(userId: string, queryText: string): Promise<ParseQueryResponseDto> {
    await this.ensureQueryEnabled();
    const context = await this.repository.getUserContext(userId);

    const ast = QueryParser.parse(queryText, context);

    const { description: timeRangeDesc } = QueryCompiler.resolveDateRange(ast.timeRange);
    const typeLabel =
      ast.transactionType === 'INCOME'
        ? 'Thu nhập'
        : ast.transactionType === 'TRANSFER'
          ? 'Chuyển khoản'
          : 'Chi tiêu';

    const entityDesc = [
      ast.categoryNames?.length ? `Danh mục: ${ast.categoryNames.join(', ')}` : null,
      ast.walletNames?.length ? `Ví: ${ast.walletNames.join(', ')}` : null,
      ast.amountFilter?.minAmount ? `> ${ast.amountFilter.minAmount.toLocaleString()} VND` : null,
      ast.amountFilter?.maxAmount ? `< ${ast.amountFilter.maxAmount.toLocaleString()} VND` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const interpretedDescription = `${typeLabel} trong ${timeRangeDesc}${entityDesc ? ` (${entityDesc})` : ''} - Tổng hợp: ${ast.aggregation}${ast.groupBy !== 'NONE' ? `, Nhóm theo: ${ast.groupBy}` : ''}`;

    return {
      ast,
      interpretedDescription,
    };
  }

  async executeQuery(
    userId: string,
    queryText?: string,
    astInput?: QueryAST,
  ): Promise<ExecuteQueryResultDto> {
    await this.ensureQueryEnabled();
    let ast = astInput;


    if (!ast && queryText) {
      const parsed = await this.parseQuery(userId, queryText);
      ast = parsed.ast;
    }

    if (!ast) {
      throw new AppError('No query or AST provided for execution', 400, ERROR_CODE.VALIDATION_ERROR);
    }

    return QueryCompiler.execute(userId, ast);
  }
}
