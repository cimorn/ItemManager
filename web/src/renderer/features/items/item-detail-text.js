import { toText } from '../../lib/project-data';

export function normalizeItemDetailInput(value) {
  return toText(value).split(/[\s·]+/u).filter(Boolean).join(' ');
}

export function normalizeItemDetail(value) {
  return normalizeItemDetailInput(value).replace(/ /g, '·');
}
