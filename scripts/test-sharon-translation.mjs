import assert from 'node:assert/strict';
import {
  autoTranslateAnnouncementEnglish,
  autoTranslateDocumentEnglish,
} from '../src/lib/sharon-translation.ts';

let calls = 0;
const translator = async (kind, fields) => {
  calls += 1;
  assert.equal(kind, 'announcement');
  assert.deepEqual(fields, {
    title: 'แจ้งซ่อมถนน',
    content: 'จะมีการซ่อมถนนหน้าสโมสร',
  });
  return {
    title: 'Road maintenance notice',
    content: 'Road maintenance will take place in front of the clubhouse.',
  };
};

const translatedAnnouncement = await autoTranslateAnnouncementEnglish({
  title_th: 'แจ้งซ่อมถนน',
  title_en: '',
  content_th: 'จะมีการซ่อมถนนหน้าสโมสร',
  content_en: '',
}, translator);

assert.equal(calls, 1);
assert.equal(translatedAnnouncement.title_en, 'Road maintenance notice');
assert.equal(translatedAnnouncement.content_en, 'Road maintenance will take place in front of the clubhouse.');

calls = 0;
const preserved = await autoTranslateDocumentEnglish({
  title_th: 'คู่มือสมาชิก',
  title_en: 'Existing English title',
  description_th: 'รายละเอียดภาษาไทย',
  description_en: 'Existing English description',
}, async () => {
  calls += 1;
  throw new Error('should not be called when English fields already exist');
});
assert.equal(calls, 0);
assert.equal(preserved.title_en, 'Existing English title');
assert.equal(preserved.description_en, 'Existing English description');

calls = 0;
const partialDocument = await autoTranslateDocumentEnglish({
  title_th: 'กฎระเบียบ',
  title_en: 'Rules and Regulations',
  description_th: 'โปรดอ่านก่อนเข้าใช้งาน',
  description_en: '',
}, async (kind, fields) => {
  calls += 1;
  assert.equal(kind, 'document');
  assert.deepEqual(fields, { description: 'โปรดอ่านก่อนเข้าใช้งาน' });
  return { description: 'Please read before use.' };
});
assert.equal(calls, 1);
assert.equal(partialDocument.title_en, 'Rules and Regulations');
assert.equal(partialDocument.description_en, 'Please read before use.');

console.log('sharon translation helper tests passed');
