// Shared between the client (displays) and the server (records a hash of the exact text agreed to).
export const CONSENT_VERSION = '2026-10-01';

export const CONSENT_TEXT = {
  data_processing:
    'I allow Credetect to store my name, email address and phone number, encrypted, for the sole purpose of finding and removing my personal information. I can withdraw this consent and delete my data at any time from Settings.',
  scanning:
    'I confirm the contact details I add belong to me, and I authorise Credetect to search supported sources for them. I understand that coverage is limited to the sources listed and that no service can search the entire internet.',
  monitoring:
    'I authorise Credetect to re-run scans on a schedule I choose and to notify me about new findings. I can switch this off at any time.',
  removal_submission:
    'I authorise Credetect to send this exact removal request on my behalf to the recipient shown. I understand that the website decides whether to remove the information and that removal is not guaranteed.',
};
