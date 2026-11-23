export const img = (id) => {
  if (!id) return '';
  if (id.startsWith('/') || id.startsWith('http')) return id;
  return `https://ps99.biggamesapi.io/image/${id}`;
};

export const GEM = '/diamond.png';
export const GEM_BAG = '/diamond-bag.png';
export const TNT = '/tnt.png';
