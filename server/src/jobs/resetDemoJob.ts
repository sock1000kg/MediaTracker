import { demoService } from '@/services/demoService.js'
import cron from 'node-cron'

export const demoResetJob = () => {
    cron.schedule('0 0 * * 0', async () => {
        try {
            await demoService.resetDemoUser()
        } catch (error) {
            console.error("\x1b[1m\x1b[31mFailed to schedule reset Demo:\x1b[0m ", error)
        }
    })
}