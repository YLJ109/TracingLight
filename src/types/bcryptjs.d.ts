// bcryptjs 2.x 无自带类型声明（本包为纯 JS 手动部署），最小声明：
declare module 'bcryptjs' {
  const bcrypt: {
    hashSync(s: string, salt: number | string): string;
    compareSync(s: string, hash: string): boolean;
    genSaltSync(rounds?: number): string;
  };
  export default bcrypt;
}
