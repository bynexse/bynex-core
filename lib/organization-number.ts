export function normalizeSwedishOrganizationNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 ? digits.slice(-10) : digits;
}

export function isValidSwedishOrganizationNumber(value: string) {
  const digits = normalizeSwedishOrganizationNumber(value);
  if (!/^\d{10}$/.test(digits) || digits === "0000000000") return false;

  const checksum = digits.split("").reduce((sum, character, index) => {
    const digit = Number(character);
    const product = digit * (index % 2 === 0 ? 2 : 1);
    return sum + (product > 9 ? product - 9 : product);
  }, 0);

  return checksum % 10 === 0;
}

export function formatSwedishOrganizationNumber(value: string) {
  const digits = normalizeSwedishOrganizationNumber(value).slice(0, 10);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}
