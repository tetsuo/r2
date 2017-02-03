import * as React from "react"
import {observer} from "mobx-react"
import strftime = require("strftime")

const styles = require("./chat.scss")

export type IChatLog = {
    time: number
    user: string
    data: string
}

export type IChatProps = {
    user: string
    channel: string
    peers: string[]
    logs?: IChatLog[]
    onMessage?: (msg: string) => void
}

const LINK_PATTERN = RegExp('((?:https?:|magnet:|ssb:|/ipfs/)\\S+)')
const LINK_PART_PATTERN = RegExp('^' + LINK_PATTERN.source)

@observer
export class Chat extends React.Component<IChatProps, void> {
    refs: { input: HTMLInputElement, lines: HTMLDivElement }

    handleSubmit = (e: any) => {
        e.preventDefault()
        const input: HTMLInputElement = this.refs.input
        const {onMessage} = this.props
        onMessage && onMessage(input.value)
        input.value = ""
    }

    render() {
        const {user, channel, peers, logs} = this.props

        return <div className={styles.chat}>

                    <div className={styles.lines} ref="lines">
                        {
                            logs
                                ? logs.map((log, i) => chatlog(log, `log-${i}`))
                                : null
                        }
                    </div>

                    <div className={styles.cli}>
                    <div className={styles.info}>
                        <span>{`[${strftime("%T", new Date)}]`}</span>
                        <span>{`[${user}]`}</span>
                        <span>{`[${channel}]`}</span>
                        {
                            channel !== "!status"
                                ? <span>{`[${(peers || []).length} peers]`}</span>
                                : null
                        }
                    </div>
                    <form className={styles.input} onSubmit={this.handleSubmit}>
                        <input ref="input" type="text" name="text" autoFocus autoComplete="off" />
                    </form>
                    </div>

        </div>
    }
}

export function chatlog(log: IChatLog, key: string) {
    const time = strftime("%T", new Date(log.time))
    const parts = log.data.split(LINK_PATTERN)

    return <div className={styles.line} key={key}>
        <span className={styles.time}>{time}</span>
        <span className={styles.user}>{`<${log.user}>`}</span>
        <span className={styles.message}>
            {
                parts.map(part => {
                    return LINK_PART_PATTERN.test(part)
                        ? <a href={`${part}`} key={`${key}-${part}`}>{part}</a>
                        : part
                })
            }
        </span>
    </div>

}