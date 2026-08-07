import * as reminderService from './services/reminderService';
import * as debtService from './services/debtService';
import * as medicineService from './services/medicineService';
import * as meetingService from './services/meetingService';
import * as ideaService from './services/ideaService';
import { scheduleForReminder, cancelAllForReminder } from './notifications';

const creators = {
  DEBT: debtService.createDebtReminder,
  MEDICINE: medicineService.createMedicineReminder,
  MEETING: meetingService.createMeetingReminder,
  IDEA: ideaService.createIdeaReminder,
};

/** Every mutation below re-syncs the on-device alarm for the affected
 *  reminder right after the write, so the notification schedule can
 *  never drift from what's in IndexedDB. */

export const api = {
  today: () => reminderService.listToday(),
  list: (params = {}) => reminderService.listReminders(params),
  get: (id) => reminderService.getReminder(id),
  history: (id) => reminderService.getHistory(id),

  create: async (payload) => {
    const category = (payload.category || '').toUpperCase();
    const creator = creators[category];
    if (!creator) throw new Error(`category must be one of ${Object.keys(creators).join(', ')}`);
    const reminder = await creator(payload);
    await scheduleForReminder(reminder);
    return reminder;
  },

  updateStatus: async (id, status) => {
    const reminder = await reminderService.updateStatus(id, status.toUpperCase());
    await scheduleForReminder(reminder);
    return reminder;
  },

  snooze: async (id, payload) => {
    const reminder = await reminderService.snooze(id, payload);
    await scheduleForReminder(reminder);
    return reminder;
  },

  remove: async (id) => {
    await cancelAllForReminder(id);
    await reminderService.deleteReminder(id);
    return null;
  },

  logPayment: async (id, payload) => {
    const result = await debtService.logPayment(id, payload);
    await scheduleForReminder(result);
    return result;
  },
  listPayments: (id) => debtService.listPayments(id),
  debtSummary: () => debtService.debtSummary(),

  logDose: async (id, payload = {}) => {
    const result = await medicineService.logDose(id, payload);
    await scheduleForReminder(result);
    return result;
  },
  listDoseLogs: (id) => medicineService.listDoseLogs(id),

  resurface: async (id) => {
    const result = await ideaService.resurfaceLater(id);
    await scheduleForReminder(result);
    return result;
  },
};
