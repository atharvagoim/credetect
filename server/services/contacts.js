import { User, VerifiedContact } from '../models/index.js';
import { decrypt } from '../utils/crypto.js';

/** Decrypted, verified, scan-enabled identifiers for a user. Kept in memory only for the scan. */
export async function getScanIdentity(userId) {
  const user = await User.findById(userId);
  const types = user?.scanDataTypes || [];
  const contacts = await VerifiedContact.find({ user: userId, verifiedAt: { $ne: null }, scanEnabled: true });
  const identity = {
    fullName: types.includes('name') && user?.fullNameEnc ? decrypt(user.fullNameEnc) : '',
    contacts: contacts
      .filter((c) => types.includes(c.type))
      .map((c) => ({ id: String(c._id), type: c.type, value: decrypt(c.valueEnc), masked: c.masked })),
  };
  return identity;
}
