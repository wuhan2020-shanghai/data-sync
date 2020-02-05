import { Service } from 'egg';
import { TableConfig, defaultValidation } from '../schema/table';

type FormatFunc = (item: any) => any;

export default class DataFormatService extends Service {

  public async format(data: any[], tableConfig: TableConfig): Promise<any> {
    if (!data || data.length === 0) {
      return [];
    }
    return data
      .filter(item => (tableConfig.validation ? tableConfig.validation(item) : defaultValidation(item)))
      .map((row, i) => this.parseRow(row, tableConfig, i))
      .filter(row => !!row);

  }

  private parseRow(row: any[], tableConfig: TableConfig, rowNum: number) {
    return row.map((cell, cellNum) => this.parseCell(cell, tableConfig, rowNum, cellNum));
  }

  private parseCell(cell: any, tableConfig: TableConfig, rowNum: number, cellNum: number) {
    if (!cell.type) {
      return cell;
    }
    let type = cell.type;
    if (cell.type.startsWith('enum')) {
      // enum{a,b}
      type = 'enum';
    } else if (cell.type.startsWith('supply')) {
      // supply|specification
      type = 'supply';
    } else if (cell.type.startsWith('bool')) {
      // bool{是,否}
      type = 'bool';
    }
    const formatter = DataFormatService.fomatters.get(type);
    if (!formatter) {
      return cell;
    }
    try {
      const i = formatter(cell);
      return i ? i : cell;
    } catch (e) {
      this.logger.error(`table[guid: ${tableConfig.guid}, indexKey:${tableConfig.indexKey}]:row[${rowNum}]:cell[${cellNum}]:err:[${JSON.stringify(e)}]`);

      return null;
    }

  }

  public static addressFormatter: FormatFunc = item => {
    item.coord = [0, 0];
    return item;
  }

  public static contactFormatter: FormatFunc = item => {
    let v: any = item.value;
    if (v === null) {
      item.value = [];
      return item;
    }
    v = v.toString();
    const contacts: { name: string; tel: string }[] = [];
    v.split('：').join(':').split('|').
      forEach(contact => {
        const s = contact.trim().split(':');
        if (s[0].trim() === '') return;
        if (s.length > 2) {
          throw new Error(`Contact value error, value=${item.value}`);
        }
        if (s.length === 2) {
          contacts.push({
            name: s[0].trim(),
            tel: s[1].trim(),
          });
        } else {
          contacts.push({
            name: '',
            tel: contact.trim(),
          });
        }
      });
    item.value = contacts;
    return item;
  }

  public static intFormatter: FormatFunc = item => {
    if (!item.value) {
      item.value = 0;
    }
    try {
      const value = parseInt(item.value);
      if (Number.isNaN(value)) {
        throw new Error();
      }
      item.value = value;
    } catch {
      throw new Error(`Int value error, value=${item.value}`);
    }
    return item;
  }

  public static floatFormatter: FormatFunc = item => {
    if (!item.value) {
      item.value = 0;
    }
    try {
      const value = parseFloat(item.value);
      if (Number.isNaN(value)) {
        throw new Error();
      }
      item.value = value;
    } catch {
      throw new Error(`Float value error, value=${item.value}`);
    }
    return item;
  }

  public static dateFormatter: FormatFunc = item => {
    if (item.value !== null) {
      if (typeof item.value === 'number') {
        item.value = DataFormatService.fromOADate(item.value);
      } else {
        item.value = new Date(item.value);
      }
    }
    return item;
  }

  public static urlFormatter: FormatFunc = item => {
    if (item.value === null) {
      return item;
    }
    // TODO 检查 URL 连通性
    return item;
  }

  public static supplyFormatter: FormatFunc = item => {
    const ts = item.type.split('|');
    if (ts[0].trim() !== 'supply') {
      throw new Error(`Supply type error, type=${item.type}`);
    }
    item.type = 'supply';
    if (ts.length > 1) {
      item.specification = ts[1];
    }
    if (item.value === null) {
      return item;
    }
    const vs = item.value.toString().split('|');
    try {
      item.value = parseInt(vs[0].trim());
    } catch {
      throw new Error(`Supply value error, value=${item.value}`);
    }
    if (vs.length > 1) {
      item.specification = vs[1].trim();
    }
    return item;
  }

  private static enumRegex = /^enum{(.*)}/;
  public static enumFormatter: FormatFunc = item => {
    if (item.value === null) {
      return item;
    }
    const res = DataFormatService.enumRegex.exec(item.type);
    if (!res) {
      throw new Error(`Enum content error, type=${item.type}`);
    }
    if (!res[1].split('，').join(',').split(',').
      some(v => v.trim() === item.value)) {
      throw new Error(`Enum value error, value=${item.value}, type=${item.type}`);
    }
    item.type = 'enum';
    return item;
  }

  public static boolFormatter: FormatFunc = item => {
    // TODO
    return item;
  }

  public static fomatters: Map<string, FormatFunc> = new Map([
    [
      'address', // 地址类信息，自动添加经纬度
      DataFormatService.addressFormatter,
    ],
    [
      'contact', // 联系人
      DataFormatService.contactFormatter,
    ],
    [
      'int', // 整型
      DataFormatService.intFormatter,
    ],
    [
      'float', // 浮点型
      DataFormatService.floatFormatter,
    ],
    [
      'date', // 时间型
      DataFormatService.dateFormatter,
    ],
    [
      'url', // 链接类型
      DataFormatService.urlFormatter,
    ],
    [
      'supply', // 物资类型
      DataFormatService.supplyFormatter,
    ],
    [
      'enum', // 枚举类型
      DataFormatService.enumFormatter,
    ],
    [
      'bool', // 类型
      DataFormatService.boolFormatter,
    ],
  ]);

  private static fromOADate(oadate: any) {
    function _getTimezoneOffset(date: any) {
      let offset = date.getTimezoneOffset();
      if (offset === -485) {
        offset = -485 - 43 / 60;
      }
      return offset;
    }

    const offsetDay = oadate - 25569;
    const date = new Date(offsetDay * 86400000);

    const adjustValue = offsetDay >= 0 ? 1 : -1;
    const oldDateTimezoneOffset = _getTimezoneOffset(date);
    const ms = (oadate * 86400000 * 1440 + adjustValue - 25569 * 86400000 * 1440 + oldDateTimezoneOffset * 86400000) / 1440;
    let firstResult = new Date(ms);

    const fixHourSign = oldDateTimezoneOffset >= 0 ? 1 : -1;
    const nextHour = new Date(ms + fixHourSign * 3600000);
    const nextHourTimezoneOffset = _getTimezoneOffset(nextHour);
    if (oldDateTimezoneOffset !== nextHourTimezoneOffset) {
      let newResult = new Date(ms + (nextHourTimezoneOffset - oldDateTimezoneOffset) * 60 * 1000);
      if (oldDateTimezoneOffset > nextHourTimezoneOffset) {
        if (fixHourSign === -1 || nextHourTimezoneOffset === _getTimezoneOffset(firstResult)) {
          newResult = newResult.getMilliseconds() === 999 ? new Date(newResult.valueOf() + 1) : newResult;
          return newResult;
        }
      } else if (oldDateTimezoneOffset < nextHourTimezoneOffset) {
        if (fixHourSign === 1 || nextHourTimezoneOffset === _getTimezoneOffset(firstResult)) {
          newResult = newResult.getMilliseconds() === 999 ? new Date(newResult.valueOf() + 1) : newResult;
          return newResult;
        }
      }
    }

    firstResult = firstResult.getMilliseconds() === 999 ? new Date(firstResult.valueOf() + 1) : firstResult;
    return firstResult;
  }
}
