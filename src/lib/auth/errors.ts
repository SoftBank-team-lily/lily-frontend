export function authError(
  error: { code?: string; status?: number } | null | undefined,
) {
  if (!error) return "요청을 처리하지 못했어요. 다시 시도해 주세요.";
  if (error.status === 429) return "요청이 많아요. 잠시 후 다시 시도해 주세요.";
  switch (error.code) {
    case "EMAIL_NOT_VERIFIED":
      return "이메일 인증이 필요해요. 받은 메일의 인증 링크를 확인해 주세요.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "이메일 또는 비밀번호를 확인해 주세요.";
    case "PASSWORD_TOO_SHORT":
      return "비밀번호는 12자 이상 입력해 주세요.";
    case "PASSWORD_TOO_LONG":
      return "비밀번호는 128자 이하로 입력해 주세요.";
    case "INVALID_TOKEN":
      return "링크가 만료되었거나 유효하지 않아요. 새 메일을 요청해 주세요.";
    default:
      return "요청을 처리하지 못했어요. 입력을 확인하거나 잠시 후 다시 시도해 주세요.";
  }
}
