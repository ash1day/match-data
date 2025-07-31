export class DateService {
  static dateToNum(date: Date): number {
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const num = year * 10000 + month * 100 + day
    return num
  }

  static todayNum(): number {
    const now = new Date()
    return DateService.dateToNum(now)
  }

  static numToDate(num: number): Date {
    const year = Math.floor(num / 10000)
    const month = Math.floor((num % 10000) / 100)
    const day = num % 100
    return new Date(year, month - 1, day)
  }

  static numToDateString(num: number): string {
    const date = DateService.numToDate(num)
    return date.toISOString().slice(0, 10)
  }
}
