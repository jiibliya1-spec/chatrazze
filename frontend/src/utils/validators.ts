export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

export const isValidOTP = (otp: string): boolean => {
  return /^\d{6}$/.test(otp);
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidName = (name: string): boolean => {
  return name.trim().length >= 2 && name.trim().length <= 255;
};

export const isValidMessage = (message: string): boolean => {
  return message.trim().length > 0 && message.length <= 4096;
};

export const validatePhoneNumber = (phone: string): { valid: boolean; error?: string } => {
  if (!phone) {
    return { valid: false, error: 'Phone number is required' };
  }
  if (!isValidPhoneNumber(phone)) {
    return { valid: false, error: 'Invalid phone number format' };
  }
  return { valid: true };
};

export const validateOTP = (otp: string): { valid: boolean; error?: string } => {
  if (!otp) {
    return { valid: false, error: 'OTP is required' };
  }
  if (!isValidOTP(otp)) {
    return { valid: false, error: 'OTP must be 6 digits' };
  }
  return { valid: true };
};

export const validateName = (name: string): { valid: boolean; error?: string } => {
  if (!name) {
    return { valid: false, error: 'Name is required' };
  }
  if (!isValidName(name)) {
    return { valid: false, error: 'Name must be between 2 and 255 characters' };
  }
  return { valid: true };
};