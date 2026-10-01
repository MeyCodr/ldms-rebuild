// LDMS is served under /phn-ldms (e.g. https://intranet.phn.com.my/phn-ldms).
// next.config.ts reads this for Next.js's basePath. Links from next/link and
// redirect() get the prefix automatically; anything that builds a URL by hand
// (a plain <a> for a file download, Auth.js) must use withBasePath().

export const BASE_PATH = "/phn-ldms";

/** "/trainings/export" → "/phn-ldms/trainings/export". */
export const withBasePath = (path: string) => `${BASE_PATH}${path}`;
