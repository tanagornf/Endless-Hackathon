import { expect, it } from 'vitest';
import { explicitlyRequestsStaff } from './intents';

it.each(['ขอคุยกับพนักงานหน่อยครับ', 'อยากคุยกับแอดมิน', 'ไม่เอาบอท', 'Can I talk to a real person please?', 'Live agent please'])(
  'recognizes the explicit request %s', (message) => expect(explicitlyRequestsStaff(message)).toBe(true),
);

it.each(['แอดมินคืออะไร', 'ไม่ต้องส่งต่อให้พนักงานค่ะ', 'What is an admin?', 'Please do not transfer me to a person.',
  'A real person sent my order yesterday.', 'The staff told me my package is ready.'])(
  'keeps ordinary conversation for %s', (message) => expect(explicitlyRequestsStaff(message)).toBe(false),
);
