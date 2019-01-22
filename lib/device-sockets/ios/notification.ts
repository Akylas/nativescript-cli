import { EventEmitter } from "events";
import { ATTACH_REQUEST_EVENT_NAME } from "../../common/constants";

export class IOSNotification extends EventEmitter implements IiOSNotification {
	private static ATTACH_REQUEST_NOTIFICATION_NAME = "AttachRequest";
	private static READY_FOR_ATTACH_NOTIFICATION_NAME = "ReadyForAttach";

	public getAttachRequest(appId: string, deviceId: string): string {
		// It could be too early to emit this event, but we rely that if you construct attach request,
		// you will execute it immediately.
		this.emit(ATTACH_REQUEST_EVENT_NAME, { deviceId, appId });
		return this.formatNotification(IOSNotification.ATTACH_REQUEST_NOTIFICATION_NAME, appId);
	}

	public getReadyForAttach(projectId: string): string {
		return this.formatNotification(IOSNotification.READY_FOR_ATTACH_NOTIFICATION_NAME, projectId);
	}

	private formatNotification(notification: string, appId: string) {
		return `${appId}:NativeScript.Debug.${notification}`;
	}
}
$injector.register("iOSNotification", IOSNotification);
