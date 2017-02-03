import * as React from "react"
import {observer} from "mobx-react"

const styles = require("./sidebar.scss")

export interface ISidebarProps {
    channel: string
    channels: string[]
    activity: { [channel: string]: boolean | "mentioned" | "activity" }
    onSelect: (channel: string) => void
}

@observer
export class Sidebar extends React.Component<ISidebarProps, void> {
    handleClick = (e) => {
        e.preventDefault()
        const {onSelect} = this.props
        onSelect && onSelect(e.target.dataset.channel)
    }

    render() {
        const {channels, activity} = this.props
        const currentChannel = this.props.channel

        return <div className={styles.sidebar}>
        {
            channels.map(channel => {
                const x = activity[channel] as string
                let c = styles[x] || ""
                if (channel === currentChannel) {
                    c = styles.current
                }

                return <div key={channel} className={styles.channel}>
                    <a onClick={this.handleClick} className={c} data-channel={channel}>
                        {channel}
                    </a>
                </div>
            })
        }
        </div>
    }
}