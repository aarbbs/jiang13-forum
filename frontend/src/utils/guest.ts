const GUEST_NICK_KEY = 'j13_guest_nick';
const GUEST_EMAIL_KEY = 'j13_guest_email';
const GUEST_URL_KEY = 'j13_guest_url';
const MY_COMMENT_IDS_KEY = 'j13_my_comment_ids';

export interface GuestInfo {
  nick: string;
  email: string;
  url: string;
}

export function loadGuestInfo(): GuestInfo {
  return {
    nick: localStorage.getItem(GUEST_NICK_KEY) || '',
    email: localStorage.getItem(GUEST_EMAIL_KEY) || '',
    url: localStorage.getItem(GUEST_URL_KEY) || '',
  };
}

export function saveGuestInfo(info: GuestInfo) {
  localStorage.setItem(GUEST_NICK_KEY, info.nick);
  localStorage.setItem(GUEST_EMAIL_KEY, info.email);
  localStorage.setItem(GUEST_URL_KEY, info.url);
}

export function loadMyCommentIds(): number[] {
  try {
    const raw = localStorage.getItem(MY_COMMENT_IDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export function addMyCommentId(id: number) {
  const ids = loadMyCommentIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(MY_COMMENT_IDS_KEY, JSON.stringify(ids.slice(-200)));
  }
}
