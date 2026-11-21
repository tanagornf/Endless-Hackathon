const cardPattern = /(?<![\d๐-๙])(?:[\d๐-๙][ -]?){12,18}[\d๐-๙](?![\d๐-๙])/g;

export function arabicDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - '๐'.charCodeAt(0)));
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const digit = Number(digits[index]);
    const doubled = (digits.length - index) % 2 === 0 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return sum % 10 === 0;
}

export function maskCardNumbers(text: string): string {
  return text.replace(cardPattern, (number) => {
    const digits = arabicDigits(number).replace(/\D/g, '');
    if (passesLuhn(digits) || (digits.length === 16 && /^[45]/.test(digits))) {
      return '[บัตร •••• ' + digits.slice(-4) + ']';
    }
    return number;
  });
}
