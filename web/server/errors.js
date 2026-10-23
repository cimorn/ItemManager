'use strict';

const MESSAGES = Object.freeze({
  INVALID_PROJECT: '物品数据格式不正确', INVALID_IMAGE: '图片格式不正确或图片尚未上传',
  TOO_LARGE: '数据超过允许大小', CONFLICT: '数据已在其他设备更新，请重新载入后再保存',
  FORBIDDEN: '没有权限修改这些数据', NOT_FOUND: '未找到图片',
  NOT_EMPTY: '只能导入到空项目', STORAGE_UNAVAILABLE: '存储暂时不可用，请稍后重试',
  INVALID_CONFIG: '存储配置不完整或不正确'
});
const STATUSES = {INVALID_PROJECT:400,INVALID_IMAGE:400,TOO_LARGE:413,CONFLICT:409,FORBIDDEN:403,NOT_FOUND:404,NOT_EMPTY:409,STORAGE_UNAVAILABLE:503,INVALID_CONFIG:503};
class StorageError extends Error {
  constructor(code='STORAGE_UNAVAILABLE') {
    const safeCode = Object.hasOwn(MESSAGES,code) ? code : 'STORAGE_UNAVAILABLE';
    super(MESSAGES[safeCode]);
    this.name='StorageError';this.code=safeCode;this.status=STATUSES[safeCode];this.statusCode=this.status;
  }
}
function safeError(error) { return error instanceof StorageError ? error : new StorageError(); }
module.exports={StorageError,safeError};
