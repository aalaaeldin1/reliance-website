export const photoUrl = (key: string, thumb = false) => `/files/${thumb ? key.replace(/\.webp$/, "_t.webp") : key}`;
