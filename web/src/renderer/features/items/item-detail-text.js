import { toText } from '../../lib/project-data';

export function normalizeItemDetail(value) {
  return toText(value).split(/[\s·]+/u).filter(Boolean).join('·');
}
