// 운영에 실제 메일 발송(SMTP)이 없어 인증 메일을 받을 수 없을 때 끄는 임시 스위치.
// 기본은 인증 필수. AUTH_REQUIRE_EMAIL_VERIFICATION=false 일 때만 끈다.
export const REQUIRE_EMAIL_VERIFICATION =
  process.env.AUTH_REQUIRE_EMAIL_VERIFICATION !== "false";
