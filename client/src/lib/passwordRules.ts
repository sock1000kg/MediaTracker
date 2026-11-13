/** Client-side mirror of the server's password strength rule (helper text + early check). */
export function passwordProblems(pw: string): string[] {
  const problems: string[] = []
  if (pw.length < 8) problems.push("8+ characters")
  if (!/[A-Z]/.test(pw)) problems.push("an uppercase letter")
  if (!/[a-z]/.test(pw)) problems.push("a lowercase letter")
  if (!/[0-9]/.test(pw)) problems.push("a number")
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push("a special character")
  return problems
}
