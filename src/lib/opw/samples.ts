export type SampleList = {
  id: string;
  name: string;
  hint: string;
  text: string;
};

export const SAMPLE_LISTS: SampleList[] = [
  {
    id: "daily",
    name: "日常超市",
    hint: "米、飲品、藥油",
    text: `金象牌頂上茉莉香米 5公斤
可口可樂 罐裝 330毫升 x8
黃道益活絡油 50毫升
維他鈣思寶 大豆原味
嘉頓忌廉檳 花生
李錦記舊庄特級蠔油`,
  },
  {
    id: "baby",
    name: "奶粉護理",
    hint: "安怡、舒特膚",
    text: `安怡長青高鈣低脂奶粉 1.7公斤
舒特膚嬰兒潤膚霜 400毫升
高露潔牙膏
潘婷洗髮露
花王紙尿片`,
  },
  {
    id: "snacks",
    name: "零食飲品",
    hint: "餅乾、汽水",
    text: `奧利奧夾心曲奇
樂事原味薯片
可口可樂 罐裝 330毫升
百事可樂
維他奶
嘉頓梳打餅`,
  },
];
