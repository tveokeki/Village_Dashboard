import assert from 'node:assert/strict';
import { buildAnnouncementBroadcastMessage, announcementDetailUrl } from '../src/lib/line-announcement-broadcast.ts';

const announcement = {
  id: 'ann-123',
  title_th: 'แจ้งซ่อมถนนในหมู่บ้าน',
  title_en: 'Road maintenance notice',
  content_th: 'จะมีการซ่อมถนนหน้าสโมสร',
  content_en: 'Road maintenance near the clubhouse',
};

const url = announcementDetailUrl(announcement, 'https://suan-ake.cloud');
assert.equal(url, 'https://suan-ake.cloud/announcements?announcement=ann-123');

const text = buildAnnouncementBroadcastMessage(announcement, 'https://suan-ake.cloud');
assert.match(text, /📢 ประกาศใหม่/);
assert.match(text, /แจ้งซ่อมถนนในหมู่บ้าน/);
assert.match(text, /https:\/\/suan-ake\.cloud\/announcements\?announcement=ann-123/);
assert.ok(text.length <= 5000, 'LINE text message must not exceed 5000 chars');

const longText = buildAnnouncementBroadcastMessage({
  ...announcement,
  title_th: 'x'.repeat(6000),
}, 'https://suan-ake.cloud');
assert.ok(longText.length <= 5000, 'long title is truncated to LINE limit');

console.log('line-announcement-broadcast tests passed');
