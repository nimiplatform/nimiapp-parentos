import {
  ensureParentOSRuntimeClientReady,
  loadParentOSRuntimeAccountUser,
  type ParentOSAuthUser,
} from '../../infra/parentos-bootstrap.js';
import { getParentOSNimiClient } from '../../infra/parentos-nimi-client.js';

const PARENTOS_ACCOUNT_CONTROL_FORBIDDEN =
  'ParentOS is an installed Nimi app and cannot own Runtime account logout. '
  + 'Use the first-party Desktop account surface.';

export async function loadCurrentUser(): Promise<ParentOSAuthUser | null> {
  await ensureParentOSRuntimeClientReady();
  return loadParentOSRuntimeAccountUser(getParentOSNimiClient().runtime);
}

export async function logoutParentOSRuntimeAccount(): Promise<void> {
  await ensureParentOSRuntimeClientReady();
  throw new Error(PARENTOS_ACCOUNT_CONTROL_FORBIDDEN);
}
