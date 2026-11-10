/**
 * Form validation logic for authentication and data entry fields
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface PasswordStrength {
  score: number; // 0 to 4
  label: 'Very Weak' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong';
  feedback: string[];
  color: string;
}

/**
 * Validate email address format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim() === '') {
    return { isValid: false, error: 'Email is required' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  return { isValid: true };
}

/**
 * Assess password strength based on length, complexity and character diversity
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: 'Very Weak',
      feedback: ['Enter a password of at least 8 characters'],
      color: '#ef4444',
    };
  }

  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('At least 8 characters required');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include at least one uppercase letter');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Include at least one number');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Include at least one special symbol (!@#$%^&*)');

  // Length bonus
  if (password.length >= 12 && score === 4) {
    return {
      score: 4,
      label: 'Very Strong',
      feedback: ['Excellent, high-security password'],
      color: '#10b981',
    };
  }

  switch (score) {
    case 4:
      return { score: 4, label: 'Strong', feedback: ['Strong password'], color: '#10b981' };
    case 3:
      return { score: 3, label: 'Medium', feedback, color: '#f59e0b' };
    case 2:
      return { score: 2, label: 'Weak', feedback, color: '#f97316' };
    default:
      return { score: 1, label: 'Very Weak', feedback, color: '#ef4444' };
  }
}

/**
 * Validate numeric data entry field within bounds
 */
export function validateNumericRange(
  val: number | string,
  min?: number,
  max?: number,
  fieldName = 'Value'
): ValidationResult {
  const num = typeof val === 'number' ? val : Number(val);
  if (isNaN(num)) {
    return { isValid: false, error: `${fieldName} must be a valid number` };
  }
  if (min !== undefined && num < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min}` };
  }
  if (max !== undefined && num > max) {
    return { isValid: false, error: `${fieldName} must not exceed ${max}` };
  }
  return { isValid: true };
}

/**
 * Format currency string
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
