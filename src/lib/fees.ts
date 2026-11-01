export const GUEST_FEE_BPS = Number(process.env.GUEST_FEE_BPS ?? 700);
export const HOST_FEE_BPS = Number(process.env.HOST_FEE_BPS ?? 500);
export const pctLabel = (bps: number) => `${bps / 100}%`;
