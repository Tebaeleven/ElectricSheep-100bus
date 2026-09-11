import { z } from "zod"
import { handStateSchema } from "@workspace/devices"

import { getStackchan, runDeviceActionWithBody } from "@/lib/devices"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const handRequestSchema = z.object({ state: handStateSchema })

/** スタックちゃんの手を開閉する（ack を待つ） */
export async function POST(request: Request) {
  return runDeviceActionWithBody(request, handRequestSchema, async (input) => {
    const stackchan = await getStackchan()
    return stackchan.handSet(input.state)
  })
}
