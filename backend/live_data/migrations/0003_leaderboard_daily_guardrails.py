from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("live_data", "0002_dailychallenge")]

    operations = [
        migrations.AddField(
            model_name="leaderboardentry",
            name="challenge_date",
            field=models.DateField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="leaderboardentry",
            name="submission_key",
            field=models.CharField(blank=True, max_length=64, null=True, unique=True),
        ),
    ]
