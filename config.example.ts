import { resolve } from 'path';

export const readCredentials: { [username: string]: string } = {
  c3lingo: '39*Aug6{Pe6F=976EcV}9Cf{eW3v4v',
  foo: 'bar',
}

export const schedulePaths: string[] = [
  resolve(__dirname, 'schedule.json'),
  resolve(__dirname, 'schedule.2.json'),
]
