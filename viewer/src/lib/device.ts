export const IS_MOBILE_DEVICE = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
)
